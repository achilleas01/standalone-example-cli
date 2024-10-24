// Taken from: https://github.com/angular/angular/blob/c611cd227045134553748df384c1458019882642/packages/core/src/resource/resource.ts

import {
  DestroyRef,
  EffectRef,
  ExperimentalPendingTasks,
  Injector,
  Signal,
  ValueEqualityFn,
  WritableSignal,
  assertInInjectionContext,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { SIGNAL, SignalNode } from '@angular/core/primitives/signals';
import {
  Resource,
  ResourceLoader,
  ResourceOptions,
  ResourceRef,
  ResourceStatus,
  WritableResource,
} from './api';

/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

/**
 * Constructs a `Resource` that projects a reactive request to an asynchronous operation defined by
 * a loader function, which exposes the result of the loading operation via signals.
 *
 * Note that `resource` is intended for _read_ operations, not operations which perform mutations.
 * `resource` will cancel in-progress loads via the `AbortSignal` when destroyed or when a new
 * request object becomes available, which could prematurely abort mutations.
 *
 * @experimental
 */
export function resource<T, R>(options: ResourceOptions<T, R>): ResourceRef<T> {
  options?.injector || assertInInjectionContext(resource);
  const request = (options.request ?? (() => null)) as () => R;
  return new WritableResourceImpl<T, R>(
    request,
    options.loader,
    options.equal,
    options.injector,
  );
}

/**
 * Base class for `WritableResource` which handles the state operations and is unopinionated on the
 * actual async operation.
 *
 * Mainly factored out for better readability.
 */
abstract class BaseWritableResource<T> implements WritableResource<T> {
  readonly value: WritableSignal<T | undefined>;
  readonly status = signal<ResourceStatus>('idle');
  readonly error = signal<unknown>(undefined);

  protected readonly rawSetValue: (value: T | undefined) => void;

  constructor(equal: ValueEqualityFn<T> | undefined) {
    this.value = signal<T | undefined>(undefined, {
      equal: equal ? wrapEqualityFn(equal) : undefined,
    });
    this.rawSetValue = this.value.set;
    this.value.set = (value: T | undefined) => this.set(value);
    this.value.update = (fn: (value: T | undefined) => T | undefined) =>
      this.set(fn(untracked(this.value)));
  }

  set(value: T | undefined): void {
    // Set the value signal and check whether its `version` changes. This will tell us
    // if the value signal actually updated or not.
    const prevVersion = (this.value[SIGNAL] as SignalNode<T>).version;
    this.rawSetValue(value);
    if ((this.value[SIGNAL] as SignalNode<T>).version === prevVersion) {
      // The value must've been equal to the previous, so no need to change states.
      return;
    }

    // We're departing from whatever state the resource was in previously, and entering
    // Local state.
    this.onLocalValue();
    this.status.set('local');
    this.error.set(undefined);
  }

  update(updater: (value: T | undefined) => T | undefined): void {
    this.value.update(updater);
  }

  isLoading(): boolean {
    return this.status() === 'loading' || this.status() === 'refreshing';
  }

  hasValue(): this is WritableResource<T> & { value: WritableSignal<T> } {
    return this.status() === 'resolved' || this.status() === 'local';
  }

  asReadonly(): Resource<T> {
    return this;
  }

  /**
   * Put the resource in a state with a given value.
   */
  protected setValueState(
    status: ResourceStatus,
    value: T | undefined = undefined,
  ): void {
    this.status.set(status);
    this.rawSetValue(value);
    this.error.set(undefined);
  }

  /**
   * Put the resource into the error state.
   */
  protected setErrorState(err: unknown): void {
    this.status.set('error');
    this.value.set(undefined);
    this.error.set(err);
  }

  /**
   * Called when the resource is transitioning to local state.
   *
   * For example, this can be used to cancel any in-progress loading operations.
   */
  protected abstract onLocalValue(): void;

  public abstract refresh(): boolean;
}

class WritableResourceImpl<T, R>
  extends BaseWritableResource<T>
  implements ResourceRef<T>
{
  private readonly request: Signal<{
    request: R;
    refresh: WritableSignal<number>;
  }>;
  private readonly pendingTasks: ExperimentalPendingTasks;
  private readonly effectRef: EffectRef;

  private pendingController: AbortController | undefined;
  private resolvePendingTask: (() => void) | undefined = undefined;

  constructor(
    requestFn: () => R,
    private readonly loaderFn: ResourceLoader<T, R>,
    equal: ValueEqualityFn<T> | undefined,
    injector: Injector | undefined,
  ) {
    super(equal);
    injector = injector ?? inject(Injector);
    this.pendingTasks = injector.get(ExperimentalPendingTasks);

    this.request = computed(() => ({
      // The current request as defined for this resource.
      request: requestFn(),

      // A counter signal which increments from 0, re-initialized for each request (similar to the
      // `linkedSignal` pattern). A value other than 0 indicates a refresh operation.
      refresh: signal(0),
    }));

    // The actual data-fetching effect.
    this.effectRef = effect(this.loadEffect.bind(this), {
      injector,
      manualCleanup: true,
      allowSignalWrites: true,
    });

    // Cancel any pending request when the resource itself is destroyed.
    injector.get(DestroyRef).onDestroy(() => this.destroy());
  }

  override refresh(): boolean {
    // We don't want to restart in-progress loads.
    const status = untracked(this.status);
    if (status === 'idle' || status === 'loading' || status === 'refreshing') {
      return false;
    }

    untracked(this.request).refresh.update((v) => v + 1);
    return true;
  }

  destroy(): void {
    this.effectRef.destroy();

    this.abortInProgressLoad();
    this.setValueState('idle');
  }

  private async loadEffect(): Promise<void> {
    // Capture the status before any state transitions.
    const previousStatus = untracked(this.status);

    // Cancel any previous loading attempts.
    this.abortInProgressLoad();

    const request = this.request();
    if (request.request === undefined) {
      // An undefined request means there's nothing to load.
      this.setValueState('idle');
      return;
    }

    // Subscribing here allows us to refresh the load later by updating the refresh signal. At the
    // same time, we update the status according to whether we're refreshing or loading.
    this.status.set(request.refresh() === 0 ? 'loading' : 'refreshing');

    // Capturing _this_ load's pending task in a local variable is important here. We may attempt to
    // resolve it twice:
    //
    //  1. when the loading function promise resolves/rejects
    //  2. when cancelling the loading operation
    //
    // After the loading operation is cancelled, `this.resolvePendingTask` no longer represents this
    // particular task, but this `await` may eventually resolve/reject. Thus, when we cancel in
    // response to (1) below, we need to cancel the locally saved task.
    const resolvePendingTask = (this.resolvePendingTask =
      this.pendingTasks.add());

    const { signal: abortSignal } = (this.pendingController =
      new AbortController());
    try {
      // The actual loading is run through `untracked` - only the request side of `resource` is
      // reactive. This avoids any confusion with signals tracking or not tracking depending on
      // which side of the `await` they are.
      const result = await untracked(() =>
        this.loaderFn({
          abortSignal,
          request: request.request as Exclude<R, undefined>,
          previous: {
            status: previousStatus,
          },
        }),
      );
      if (abortSignal.aborted) {
        // This load operation was cancelled.
        return;
      }
      // Success :)
      this.setValueState('resolved', result);
    } catch (err) {
      if (abortSignal.aborted) {
        // This load operation was cancelled.
        return;
      }
      // Fail :(
      this.setErrorState(err);
    } finally {
      // Resolve the pending task now that loading is done.
      resolvePendingTask();
    }
  }

  private abortInProgressLoad(): void {
    this.pendingController?.abort();
    this.pendingController = undefined;

    // Once the load is aborted, we no longer want to block stability on its resolution.
    this.resolvePendingTask?.();
    this.resolvePendingTask = undefined;
  }

  protected override onLocalValue(): void {
    this.abortInProgressLoad();
  }
}

/**
 * Wraps an equality function to handle either value being `undefined`.
 */
function wrapEqualityFn<T>(
  equal: ValueEqualityFn<T>,
): ValueEqualityFn<T | undefined> {
  return (a, b) => (a === undefined || b === undefined ? a === b : equal(a, b));
}
