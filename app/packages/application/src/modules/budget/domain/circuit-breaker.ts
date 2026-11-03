import { ProviderCircuitBrokenError } from './budget-errors.js';
import { type AiModality } from './budget.types.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  readonly failureThreshold: number; // e.g. 3
  readonly windowDurationMs: number; // e.g. 120,000 (2 minutes)
  readonly probeIntervalMs: number; // e.g. 60,000 (60 seconds)
}

interface FailureRecord {
  readonly timestamp: number;
}

interface ProviderCircuitState {
  state: CircuitState;
  consecutiveFailures: number;
  failures: FailureRecord[];
  lastTrippedAt: number | null;
  lastProbeAt: number | null;
}

export class CircuitBreakerService {
  private readonly circuits = new Map<string, ProviderCircuitState>();

  public constructor(
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 3,
      windowDurationMs: 120_000,
      probeIntervalMs: 60_000,
    },
  ) {}

  private getCircuitKey(providerId: string, modality: AiModality): string {
    return `${providerId.toLowerCase()}:${modality.toLowerCase()}`;
  }

  private getOrCreateCircuit(key: string): ProviderCircuitState {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        failures: [],
        lastTrippedAt: null,
        lastProbeAt: null,
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  /**
   * Asserts whether the circuit is healthy for execution.
   * Throws ProviderCircuitBrokenError if OPEN and not ready for probe.
   */
  public assertHealthy(providerId: string, modality: AiModality, now = Date.now()): void {
    const key = this.getCircuitKey(providerId, modality);
    const circuit = this.getOrCreateCircuit(key);

    if (circuit.state === 'OPEN') {
      const timeSinceTrip = now - (circuit.lastTrippedAt ?? 0);
      if (timeSinceTrip >= this.config.probeIntervalMs) {
        // Transition to HALF_OPEN to permit a single canary probe
        circuit.state = 'HALF_OPEN';
        circuit.lastProbeAt = now;
        return;
      }
      throw new ProviderCircuitBrokenError(providerId, modality);
    }
  }

  public recordSuccess(providerId: string, modality: AiModality): void {
    const key = this.getCircuitKey(providerId, modality);
    const circuit = this.getOrCreateCircuit(key);

    circuit.state = 'CLOSED';
    circuit.consecutiveFailures = 0;
    circuit.failures = [];
    circuit.lastTrippedAt = null;
    circuit.lastProbeAt = null;
  }

  public recordFailure(providerId: string, modality: AiModality, now = Date.now()): void {
    const key = this.getCircuitKey(providerId, modality);
    const circuit = this.getOrCreateCircuit(key);

    // Prune failures outside the rolling window
    circuit.failures = circuit.failures.filter(
      (f) => now - f.timestamp <= this.config.windowDurationMs,
    );
    circuit.failures.push({ timestamp: now });
    circuit.consecutiveFailures += 1;

    if (circuit.state === 'HALF_OPEN' || circuit.failures.length >= this.config.failureThreshold) {
      circuit.state = 'OPEN';
      circuit.lastTrippedAt = now;
    }
  }

  public getCircuitState(providerId: string, modality: AiModality, now = Date.now()): CircuitState {
    const key = this.getCircuitKey(providerId, modality);
    const circuit = this.getOrCreateCircuit(key);

    if (circuit.state === 'OPEN') {
      const timeSinceTrip = now - (circuit.lastTrippedAt ?? 0);
      if (timeSinceTrip >= this.config.probeIntervalMs) {
        return 'HALF_OPEN';
      }
    }
    return circuit.state;
  }

  public reset(providerId?: string, modality?: AiModality): void {
    if (providerId && modality) {
      const key = this.getCircuitKey(providerId, modality);
      this.circuits.delete(key);
    } else {
      this.circuits.clear();
    }
  }
}
