import React from 'react';

interface BadgeProps {
  children?: React.ReactNode;
  color?: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  placement?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
}

const BadgeContext = React.createContext(false);

export const Badge = ({ children, color = 'default', size = 'md', placement = 'top-right', className = '' }: BadgeProps) => {
  const isAnchored = React.useContext(BadgeContext);
  
  const baseClasses = "flex items-center justify-center rounded-full font-semibold border-2 border-surface z-10 transition-transform";
  
  const colorClasses = {
    default: "bg-white/20 text-white",
    accent: "bg-primary text-white",
    success: "bg-success text-white",
    warning: "bg-orange-500 text-white",
    danger: "bg-danger text-white",
  }[color];

  const hasContent = children !== undefined && children !== null && children !== '';

  const sizeClasses = {
    sm: hasContent ? "min-w-[18px] h-[18px] text-[10px] px-1" : "w-2.5 h-2.5",
    md: hasContent ? "min-w-[22px] h-[22px] text-xs px-1.5" : "w-3 h-3",
    lg: hasContent ? "min-w-[26px] h-[26px] text-sm px-2" : "w-3.5 h-3.5",
  }[size];

  let placementClasses = "";
  if (isAnchored) {
    placementClasses = "absolute transform ";
    if (placement === 'top-right') placementClasses += "top-0 right-0 translate-x-1/3 -translate-y-1/3";
    if (placement === 'top-left') placementClasses += "top-0 left-0 -translate-x-1/3 -translate-y-1/3";
    if (placement === 'bottom-right') placementClasses += "bottom-0 right-0 translate-x-1/3 translate-y-1/3";
    if (placement === 'bottom-left') placementClasses += "bottom-0 left-0 -translate-x-1/3 translate-y-1/3";
  }

  return (
    <div className={`${baseClasses} ${colorClasses} ${sizeClasses} ${placementClasses} ${className}`}>
      {children}
    </div>
  );
};

export const BadgeAnchor = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <BadgeContext.Provider value={true}>
      <div className={`relative inline-flex shrink-0 ${className}`}>
        {children}
      </div>
    </BadgeContext.Provider>
  );
};

Badge.Anchor = BadgeAnchor;
