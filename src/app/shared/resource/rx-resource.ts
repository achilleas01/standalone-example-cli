/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { assertInInjectionContext } from '@angular/core';
import { firstValueFrom, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ResourceLoaderParams, ResourceOptions, ResourceRef } from './api';
import { resource } from './resource';

/**
 * Like `ResourceOptions` but uses an RxJS-based `loader`.
 *
 * @experimental
 */
export interface RxResourceOptions<T, R>
  extends Omit<ResourceOptions<T, R>, 'loader'> {
  loader: (params: ResourceLoaderParams<R>) => Observable<T>;
}

/**
 * Like `resource` but uses an RxJS based `loader` which maps the request to an `Observable` of the
 * resource's value. Like `firstValueFrom`, only the first emission of the Observable is considered.
 *
 * @experimental
 */
export function rxResource<T, R>(
  opts: RxResourceOptions<T, R>,
): ResourceRef<T> {
  opts?.injector || assertInInjectionContext(rxResource);
  return resource<T, R>({
    ...opts,
    loader: (params) => {
      const cancelled = new Subject<void>();
      params.abortSignal.addEventListener('abort', () => cancelled.next());
      return firstValueFrom(opts.loader(params).pipe(takeUntil(cancelled)));
    },
  });
}
