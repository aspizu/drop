import {createFileRoute} from "@tanstack/react-router"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const Route = createFileRoute("/")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="grid h-dvh place-items-center">
      <div className="text-lg font-medium text-muted-foreground">
        Drop or click to upload files
      </div>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Expire in..." />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="1hr">1 hour</SelectItem>
            <SelectItem value="8hr">8 hours</SelectItem>
            <SelectItem value="1day">1 day</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
