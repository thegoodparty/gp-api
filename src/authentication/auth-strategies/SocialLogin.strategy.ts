import { Injectable } from "@nestjs/common";
import { Strategy } from "passport-jwt";

@Injectable()
export class SocialLoginStrategy extends Strategy {
  constructor() {
    super();
  }
}
