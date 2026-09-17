import { MattersModule } from './matters/matters.module';
import { ClientsModule } from './clients/clients.module';
import { ProceedingsModule } from './proceedings/proceedings.module';
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ClientsModule, MattersModule, ProceedingsModule],
  controllers: [HealthController],
})
export class AppModule {}
