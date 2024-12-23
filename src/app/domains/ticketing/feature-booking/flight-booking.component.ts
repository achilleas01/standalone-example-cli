import { Component, inject } from "@angular/core";
import { RouterLink, RouterOutlet } from "@angular/router";
import { LogService } from "../../../shared/util-logger";

@Component({
  standalone: true,
  selector: 'app-flight-booking',
  imports: [
    RouterOutlet,
    RouterLink,
  ],
  templateUrl: './flight-booking.component.html'
})
export class FlightBookingComponent {
  logger = inject(LogService);

  constructor() {
    this.logger.info('booking', 'Hello from Booking');
  }

}
