import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface PlaceholderPageProps {
  title: string;
  /** PRD story reference(s), e.g. "US-A1". */
  story?: string;
  description?: string;
  /** Release the screen ships in. */
  release?: "MVP" | "v1.1" | "v1.2";
}

/** Temporary scaffold screen. Replace with the real feature when its story is implemented. */
export function PlaceholderPage({
  title,
  story,
  description,
  release = "MVP",
}: PlaceholderPageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{release}</Badge>
            {story ? <Badge variant="outline">{story}</Badge> : null}
          </div>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Coming soon — this screen is a scaffold placeholder.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
