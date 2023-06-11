import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Flight } from './flight';

@Injectable({
  providedIn: 'root'
})
export class FlightService {
  baseUrl = `https://demo.angulararchitects.io/api`;

  constructor(private http: HttpClient) {}

  find(
    from: string,
    to: string,
    urgent: boolean = false
  ): Observable<Flight[]> {
    // let url = [this.baseUrl, 'flight'].join('/');

    // if (urgent) {
    //   url = [this.baseUrl, 'error?code=403'].join('/');
    // }

    // const params = new HttpParams().set('from', from).set('to', to);

    // const headers = new HttpHeaders().set('Accept', 'application/json');
    // const flights$ = this.http.get<Flight[]>(url, { params, headers });

    // return flights$;

    const flights = [] as Flight[];
    for (var i=0; i<100; i++) {
      flights.push({id: i, from: 'a', to: 'b', date: new Date().toISOString(), counter: 1, delayed: false});
    }

    return of(flights);

  }
 
}