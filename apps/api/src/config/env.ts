import { parseServerEnv, type ServerEnv } from '@sp/shared';

export const ENV = Symbol('ENV');
export const envProvider = {
  provide: ENV,
  useFactory: (): ServerEnv => parseServerEnv(process.env),
};
export type Env = ServerEnv;
