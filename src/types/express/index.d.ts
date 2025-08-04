import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string;
      username?: string;
      createdAt?: Date;
      updatedAt?: Date;
      deletedAt?: Date;
    }
  }
}
