import { Injectable } from '@nestjs/common'

@Injectable()
export class PeerlyConfigService {
  get p2pDefaults() {
    return {
      suppressCellPhones: parseInt(
        process.env.PEERLY_P2P_SUPPRESS_CELL_PHONES || '4',
        10,
      ),
      splitTimezones: parseInt(
        process.env.PEERLY_P2P_SPLIT_TIMEZONES || '1',
        10,
      ),
      useNatDnc: parseInt(process.env.PEERLY_P2P_USE_NAT_DNC || '0', 10),
      maxFileSize: parseInt(
        process.env.PEERLY_MAX_FILE_SIZE || '104857600',
        10,
      ), // 100MB default
    }
  }

  get pollingConfig() {
    return {
      maxAttempts: parseInt(
        process.env.PEERLY_POLLING_MAX_ATTEMPTS || '60',
        10,
      ),
      initialDelayMs: parseInt(
        process.env.PEERLY_POLLING_INITIAL_DELAY_MS || '5000',
        10,
      ),
      maxDelayMs: parseInt(
        process.env.PEERLY_POLLING_MAX_DELAY_MS || '30000',
        10,
      ),
      backoffMultiplier: parseFloat(
        process.env.PEERLY_POLLING_BACKOFF_MULTIPLIER || '1.5',
      ),
    }
  }
}
