import { forwardRef } from 'react'
import { Button, ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TooltipIconButtonProps extends ButtonProps {
  tooltip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ tooltip, side = 'top', children, ...props }, ref) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button ref={ref} variant="ghost" size="icon" {...props}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    )
  }
)

TooltipIconButton.displayName = 'TooltipIconButton'
