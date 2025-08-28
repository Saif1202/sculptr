declare module '@/components/StripeProvider' {
  import * as React from 'react';
  export type StripeProviderProps = { publishableKey?: string; children?: React.ReactNode; };
  export const StripeProvider: React.ComponentType<StripeProviderProps>;
}