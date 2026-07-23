import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Coming in PP.x</CardTitle>
          <CardDescription>This page will be built out in a future sprint.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
