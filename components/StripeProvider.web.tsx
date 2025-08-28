import React from 'react';
type Props = { publishableKey?: string; children?: React.ReactNode; };
export function StripeProvider({ children }: Props) { return <>{children}</>; }