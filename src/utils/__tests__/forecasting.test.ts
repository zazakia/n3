import { calculateLinearRegressionForecast, calculateDoubleExponentialSmoothing, TimeSeriesPoint } from '../forecasting';

describe('forecasting utilities', () => {
  describe('calculateLinearRegressionForecast', () => {
    it('returns empty array when historical data is too small', () => {
      const data: TimeSeriesPoint[] = [{ date: new Date('2026-06-01'), value: 100 }];
      expect(calculateLinearRegressionForecast(data, 3)).toEqual([]);
    });

    it('forecasts a positive linear trend correctly', () => {
      const data: TimeSeriesPoint[] = [
        { date: new Date('2026-06-01'), value: 100 },
        { date: new Date('2026-06-08'), value: 110 },
        { date: new Date('2026-06-15'), value: 120 },
      ];
      // Slope is +10 per week
      const result = calculateLinearRegressionForecast(data, 2, 7);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(130);
      expect(result[1].value).toBe(140);
      
      // Dates should advance by 7 days per step
      expect(result[0].date.getDate()).toBe(22); // 15 + 7
      expect(result[1].date.getDate()).toBe(29); // 15 + 14
    });

    it('clamps negative values to zero for downward trends', () => {
      const data: TimeSeriesPoint[] = [
        { date: new Date('2026-06-01'), value: 100 },
        { date: new Date('2026-06-08'), value: 50 },
      ];
      // Slope is -50, so next points would be 0, -50.
      const result = calculateLinearRegressionForecast(data, 2, 7);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(0);
      expect(result[1].value).toBe(0);
    });
  });

  describe('calculateDoubleExponentialSmoothing', () => {
    it('returns empty array when dataset is too small', () => {
      expect(calculateDoubleExponentialSmoothing([100], 3)).toEqual([]);
    });

    it('generates reasonable forecasts accounting for trend', () => {
      const historicalData = [100, 105, 112, 120, 128]; // Upward trend
      const forecasts = calculateDoubleExponentialSmoothing(historicalData, 3, 0.4, 0.2);
      expect(forecasts).toHaveLength(3);
      
      // Since it's an upward trend, projections should continue upwards
      expect(forecasts[0]).toBeGreaterThan(128);
      expect(forecasts[1]).toBeGreaterThan(forecasts[0]);
      expect(forecasts[2]).toBeGreaterThan(forecasts[1]);
    });

    it('clamps forecasts to zero when double exponential projects below zero', () => {
      const historicalData = [100, 80, 60, 40, 20]; // Steep downward trend
      const forecasts = calculateDoubleExponentialSmoothing(historicalData, 3, 0.5, 0.5);
      expect(forecasts).toHaveLength(3);
      expect(forecasts[0]).toBe(0);
      expect(forecasts[1]).toBe(0);
      expect(forecasts[2]).toBe(0);
    });
  });
});
