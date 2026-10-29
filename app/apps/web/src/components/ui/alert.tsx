import React, { type HTMLAttributes } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type AlertType = 'info' | 'good' | 'warn' | 'bad';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  readonly type?: AlertType;
  readonly title?: string;
  readonly icon?: React.ReactNode;
}

const typeConfig: Record<
  AlertType,
  { container: string; iconClass: string; DefaultIcon: React.ElementType }
> = {
  info: {
    container: 'bg-[#243746]/5 border-[#243746]/20 text-navy-900',
    iconClass: 'text-navy-900',
    DefaultIcon: Info,
  },
  good: {
    container: 'bg-[#23856B]/8 border-[#23856B]/25 text-[#185d4b]',
    iconClass: 'text-status-good',
    DefaultIcon: CheckCircle2,
  },
  warn: {
    container: 'bg-[#B67C27]/8 border-[#B67C27]/25 text-[#8a5b17]',
    iconClass: 'text-status-warn',
    DefaultIcon: AlertTriangle,
  },
  bad: {
    container: 'bg-[#C25656]/8 border-[#C25656]/25 text-[#9e3e3e]',
    iconClass: 'text-status-bad',
    DefaultIcon: AlertCircle,
  },
};

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  icon,
  className = '',
  children,
  ...props
}) => {
  const { container, iconClass, DefaultIcon } = typeConfig[type];

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 border rounded-xl text-sm ${container} ${className}`}
      {...props}
    >
      <div className={`mt-0.5 shrink-0 ${iconClass}`}>
        {icon ?? <DefaultIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        {title && <h4 className="font-semibold mb-0.5 leading-snug">{title}</h4>}
        <div className="text-xs leading-relaxed opacity-95">{children}</div>
      </div>
    </div>
  );
};
