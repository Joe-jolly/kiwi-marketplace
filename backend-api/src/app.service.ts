import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Server run succesfully and listening on port 3000 !';
  }
}
