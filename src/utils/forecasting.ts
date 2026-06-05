/**
 * Local Forecasting & Time-Series Data Science Utilities.
 * Implements algorithms for predicting financial trends, loan disbursements,
 * and collection rates directly in-app.
 */

export interface TimeSeriesPoint {
  date: Date;
  value: number;
}

/**
 * Calculates a simple linear regression projection for the given data points.
 * Useful for simple straight-line trends.
 * 
 * @param data Historical time series data points.
 * @param periodsToProject Number of future periods to predict.
 * @param intervalDays Number of days per period (e.g. 7 for weekly, 30 for monthly).
 */
export function calculateLinearRegressionForecast(
  data: TimeSeriesPoint[],
  periodsToProject: number,
  intervalDays: number = 7
): TimeSeriesPoint[] {
  if (data.length < 2) return [];

  // Sort chronologically
  const sorted = [...data].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const n = sorted.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += sorted[i].value;
    sumXY += i * sorted[i].value;
    sumXX += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const lastPoint = sorted[n - 1];
  const projections: TimeSeriesPoint[] = [];

  for (let j = 1; j <= periodsToProject; j++) {
    const projectedIndex = n - 1 + j;
    // Lower bound the projection at 0 since financial figures cannot be negative
    const projectedValue = Math.max(0, slope * projectedIndex + intercept);
    
    const projectedDate = new Date(lastPoint.date);
    projectedDate.setDate(lastPoint.date.getDate() + (j * intervalDays));

    projections.push({
      date: projectedDate,
      value: Number(projectedValue.toFixed(2))
    });
  }

  return projections;
}

/**
 * Calculates Double Exponential Smoothing (Holt's Linear Exponential Smoothing).
 * Best for data with a clear trend but without complex seasonality.
 * 
 * Formula:
 *   Level:   L_t = alpha * Y_t + (1 - alpha) * (L_{t-1} + T_{t-1})
 *   Trend:   T_t = beta * (L_t - L_{t-1}) + (1 - beta) * T_{t-1}
 *   Forecast: F_{t+m} = L_t + m * T_t
 * 
 * @param data Historical numbers.
 * @param periodsToProject Number of steps to project.
 * @param alpha Level smoothing factor (0 < alpha < 1). Higher values weigh recent data more.
 * @param beta Trend smoothing factor (0 < beta < 1).
 */
export function calculateDoubleExponentialSmoothing(
  data: number[],
  periodsToProject: number,
  alpha: number = 0.3,
  beta: number = 0.1
): number[] {
  if (data.length < 2) return [];

  // Initialize
  const level: number[] = new Array(data.length);
  const trend: number[] = new Array(data.length);

  level[0] = data[0];
  trend[0] = data[1] - data[0]; // Initial trend estimate

  for (let i = 1; i < data.length; i++) {
    level[i] = alpha * data[i] + (1 - alpha) * (level[i - 1] + trend[i - 1]);
    trend[i] = beta * (level[i] - level[i - 1]) + (1 - beta) * trend[i - 1];
  }

  const lastLevel = level[data.length - 1];
  const lastTrend = trend[data.length - 1];
  const forecasts: number[] = [];

  for (let m = 1; m <= periodsToProject; m++) {
    const forecastedValue = Math.max(0, lastLevel + m * lastTrend);
    forecasts.push(Number(forecastedValue.toFixed(2)));
  }

  return forecasts;
}
