export enum FlightState {
  Ground = 'GROUND',
  Jump = 'JUMP',
  Takeoff = 'TAKEOFF',
  Hover = 'HOVER',
  Cruise = 'CRUISE',
  Boost = 'BOOST',
  Brake = 'BRAKE',
  /** Propulsion off: gravity-driven free fall. */
  Fall = 'FALL',
  /** The last moments of a fall: legs come down and the body braces for contact. */
  Landing = 'LANDING',
}
