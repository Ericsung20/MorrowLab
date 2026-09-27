/** Transient display data. Never persisted in study events. Left/right are the wearer's sides. */
export interface FaceExpression {
  blinkLeft: number;
  blinkRight: number;
  gazeX: number;
  gazeY: number;
  mouthOpen: number;
  smile: number;
}
export interface HeadTracking {
  yaw: number;
  pitch: number;
  expression?: FaceExpression;
}
