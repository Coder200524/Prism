import { Link } from "react-router-dom";
import { Card } from "../../components/Card";

export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-slate-900">DOGFOOD Portal</h1>
        <p className="max-w-2xl text-base text-slate-600">
          A self-hosted hackathon submission and judging portal. Browse open events, explore
          submitted projects, and manage teams, scoring, and results when you have access.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/events"
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Browse events
          </Link>
          <Link
            to="/gallery"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Browse gallery
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Events & submissions</h2>
          <p className="mt-2 text-sm text-slate-600">
            Find published hackathons, form a team, and submit your project while submissions are
            open.
          </p>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Judging & results</h2>
          <p className="mt-2 text-sm text-slate-600">
            Organizers invite judges, assign projects, and publish ranked results when judging is
            complete.
          </p>
        </Card>
      </section>
    </div>
  );
}
