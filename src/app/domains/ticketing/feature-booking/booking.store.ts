import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from "@ngrx/signals";
import { Flight, FlightService } from "../data";
import { computed, inject } from "@angular/core";
import { Criteria } from "./criteria";
import { addMinutes } from "src/app/shared/util-common";

export const BookingStore = signalStore(
    { providedIn: 'root' },
    withState({
        from: 'Hamburg',
        to: 'London',
        flights: [] as Flight[],
        basket: {} as Record<number, boolean>
    }),
    withComputed((store) => ({
        selected: computed(() => store.flights().filter(f => store.basket()[f.id])),
        criteria: computed(() => ({ from: store.from, to: store.to }))
    })),
    withMethods((
        store,
        flightService = inject(FlightService)
    ) => ({
        async load(): Promise<void> {
            const flights = await flightService.findPromise(store.from(), store.to());
            patchState(store, { flights });
        },
        updateCriteria(c: Criteria): void {
            patchState(store, c);
        },
        updateBasket(flightId: number, selected: boolean): void {
            patchState(store, ({ basket }) => ({
                basket: {
                    ...basket,
                    [flightId]: selected
                }
            }));
        },
        delay(): void {
            patchState(store, ({ flights }) => ({
                flights: [
                    {
                        ...flights[0],
                        date: addMinutes(flights[0].date, 15)
                    },
                    ...flights.slice(1)
                ]
            }));
        }
    })),
    withHooks({
        onInit(store) {
            store.load();
        },
        onDestroy(store) {
            console.log('Hasta la vista, Store!', store)
        }
    })
)