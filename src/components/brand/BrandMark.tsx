import Image from "next/image";

interface BrandMarkProps {
  size: number;
  className?: string;
}

/** The Tentact block mark (decorative — always paired with the visible wordmark). */
export function BrandMark({ size, className }: BrandMarkProps) {
  return (
    <Image
      className={className}
      src="/assets/logo/tentact-block-mark.svg"
      width={size}
      height={size}
      alt=""
    />
  );
}
