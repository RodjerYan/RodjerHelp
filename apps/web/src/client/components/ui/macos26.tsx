import React from 'react';

export function Macos26Surface(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={`macos26-surface ${className}`.trim()} {...rest} />;
}

export function Macos26Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={`macos26-card ${className}`.trim()} {...rest} />;
}

export function Macos26Dialog(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = '', ...rest } = props;
  return <div className={`macos26-dialog ${className}`.trim()} {...rest} />;
}
