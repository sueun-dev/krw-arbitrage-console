/**
 * @fileoverview Custom error types for the arbitrage application.
 * All errors extend ArbitrageError for consistent error handling.
 */

/**
 * Base error class for all arbitrage-related errors.
 * Provides consistent error structure with optional cause chaining.
 */
export class ArbitrageError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
    this.name = "ArbitrageError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when exchange API calls fail.
 * Includes the exchange name for debugging.
 */
export class ExchangeApiError extends ArbitrageError {
  constructor(
    public readonly exchange: string,
    message: string,
    cause?: unknown
  ) {
    super(`[${exchange}] ${message}`, cause);
    this.name = "ExchangeApiError";
  }
}

/**
 * Error thrown when market data is unavailable or invalid.
 * Includes the symbol for context.
 */
export class MarketDataError extends ArbitrageError {
  constructor(
    public readonly symbol: string,
    message: string,
    cause?: unknown
  ) {
    super(`[${symbol}] ${message}`, cause);
    this.name = "MarketDataError";
  }
}

/**
 * Error thrown when transfer operations fail.
 * Includes coin and direction information.
 */
export class TransferError extends ArbitrageError {
  constructor(
    public readonly coin: string,
    public readonly direction: "deposit" | "withdraw",
    message: string,
    cause?: unknown
  ) {
    super(`[${coin}/${direction}] ${message}`, cause);
    this.name = "TransferError";
  }
}

/**
 * Error thrown when HTTP requests fail.
 * Includes URL and status code for debugging.
 */
export class HttpError extends ArbitrageError {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message: string,
    cause?: unknown
  ) {
    super(`HTTP ${status} - ${url}: ${message}`, cause);
    this.name = "HttpError";
  }
}

/**
 * Error thrown when WebSocket connections fail.
 * Includes exchange and connection details.
 */
export class WebSocketError extends ArbitrageError {
  constructor(
    public readonly exchange: string,
    message: string,
    cause?: unknown
  ) {
    super(`[WS:${exchange}] ${message}`, cause);
    this.name = "WebSocketError";
  }
}

/**
 * Error thrown when configuration is invalid.
 */
export class ConfigurationError extends ArbitrageError {
  constructor(
    public readonly configKey: string,
    message: string,
    cause?: unknown
  ) {
    super(`[Config:${configKey}] ${message}`, cause);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when rate conversion fails.
 */
export class RateConversionError extends ArbitrageError {
  constructor(
    public readonly fromCurrency: string,
    public readonly toCurrency: string,
    message: string,
    cause?: unknown
  ) {
    super(`[Rate:${fromCurrency}/${toCurrency}] ${message}`, cause);
    this.name = "RateConversionError";
  }
}
