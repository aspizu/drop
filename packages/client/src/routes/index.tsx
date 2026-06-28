import {createFileRoute} from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <div>Drop or click to upload files</div>
    </div>
  )
}
