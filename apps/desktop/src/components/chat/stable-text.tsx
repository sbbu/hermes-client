import { cn } from '@/lib/utils'

interface StableTextProps {
  children: string
  className?: string
}

/** Render characters in fixed-width cells so ticking text cannot reflow. */
export function StableText({ children, className }: StableTextProps) {
  return (
    <span className={cn('inline-flex', className)}>
      {children.split('').map((char, index) => (
        <span className="inline-block w-[1ch] text-center" key={index}>
          {char}
        </span>
      ))}
    </span>
  )
}
