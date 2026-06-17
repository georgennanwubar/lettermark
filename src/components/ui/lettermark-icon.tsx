import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface LettermarkIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  /** White-outline variant for use on Sapphire or other dark fills */
  white?: boolean;
}

/**
 * The Lettermark brand mark — Sapphire rounded-square containing a white
 * double-outlined L interlocked with a bookmark ribbon. Source of truth is
 * the locked artwork at assets/lettermark-icon.svg in the design system.
 *
 * Use the `white` prop when placing on a Sapphire / coloured fill so the
 * inner mark remains visible. On Abyss (dark sidebar) use the default colour
 * version — the Sapphire square reads well against the dark ground.
 */
export function LettermarkIcon({
  size = 32,
  white = false,
  className,
  ...props
}: LettermarkIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 478 504"
      width={size}
      height={size}
      role="img"
      aria-label="Lettermark"
      className={cn("shrink-0", className)}
      {...props}
    >
      {/* Sapphire rounded-square background */}
      <path
        d="M83.5 1.0 L394.0 0.5 L410.0 3.5 L431.0 12.5 L444.0 21.5 L456.5 34.0 L470.5 57.0 L476.5 77.0 L476.5 424.0 L470.5 446.0 L457.5 468.0 L443.0 482.5 L428.0 492.5 L414.0 498.5 L395.0 502.5 L91.0 503.5 L62.0 498.5 L43.0 489.5 L30.0 479.5 L18.5 467.0 L5.5 444.0 L0.5 426.0 L-0.5 412.0 L0.5 76.0 L9.5 50.0 L19.5 35.0 L32.0 22.5 L41.0 15.5 L58.0 6.5 L71.0 2.5 L83.0 1.5 Z"
        fill={white ? "rgba(255,255,255,0.15)" : "#1C4FC4"}
        fillRule="evenodd"
      />
      {/* White double-outlined L + bookmark mark */}
      <path
        d="M140.5 102.0 L185.0 101.5 L191.0 103.5 L199.5 114.0 L200.5 318.0 L338.0 319.5 L346.5 325.0 L350.5 333.0 L350.5 379.0 L347.5 386.0 L343.0 390.5 L336.0 393.5 L141.0 393.5 L134.0 390.5 L129.5 386.0 L126.5 380.0 L126.5 114.0 L134.0 104.5 L140.0 102.5 Z M235.5 114.0 L330.0 113.5 L337.5 119.0 L339.5 123.0 L339.5 288.0 L336.0 290.5 L330.0 289.5 L283.0 247.5 L234.0 290.5 L229.0 290.5 L226.5 288.0 L225.5 127.0 L228.5 119.0 L235.0 114.5 Z M142.5 116.0 L184.0 115.5 L186.5 119.0 L186.5 332.0 L334.0 332.5 L336.5 335.0 L336.5 377.0 L334.0 379.5 L143.0 379.5 L140.5 377.0 L140.5 118.0 L142.0 116.5 Z M239.5 126.0 L326.0 125.5 L327.5 127.0 L327.5 269.0 L285.0 232.5 L281.0 232.5 L275.0 236.5 L240.0 268.5 L238.5 268.0 L239.0 126.5 Z"
        fill={white ? "#FFFFFF" : "#FFFFFF"}
        fillRule="evenodd"
      />
    </svg>
  );
}
