import { useState, type FormEvent } from "react";
import { useEvent } from "../../../api/hooks/events";
import {
  useCreateJudgeInvite,
  useJudges,
  useRemoveJudge,
  useSetJudgeTracks,
} from "../../../api/hooks/judging";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { CopyLink } from "../../../components/CopyLink";
import { EmptyState } from "../../../components/EmptyState";
import { ErrorMessage } from "../../../components/ErrorMessage";
import { Input } from "../../../components/Input";
import { Table } from "../../../components/Table";

export function JudgesTab({ eventId }: { eventId: string }) {
  const eventQuery = useEvent(eventId);
  const judgesQuery = useJudges(eventId);
  const invite = useCreateJudgeInvite(eventId);
  const setTracks = useSetJudgeTracks(eventId);
  const removeJudge = useRemoveJudge(eventId);

  const [email, setEmail] = useState("");
  const [trackIds, setTrackIds] = useState<string[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const tracks = eventQuery.data?.event.tracks ?? [];

  function toggleTrack(trackId: string) {
    setTrackIds((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : [...current, trackId],
    );
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault();
    const result = await invite.mutateAsync({ email, trackIds });
    setInviteUrl(result.inviteUrl);
    setEmail("");
  }

  if (judgesQuery.isLoading || eventQuery.isLoading) {
    return <p className="text-slate-600">Loading judges…</p>;
  }
  if (judgesQuery.isError) return <ErrorMessage error={judgesQuery.error} />;
  if (eventQuery.isError) return <ErrorMessage error={eventQuery.error} />;

  const judges = judgesQuery.data?.judges ?? [];

  return (
    <div className="space-y-6">
      <Card title="Invite judge">
        <form onSubmit={(e) => void onInvite(e)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Preferred tracks</legend>
            <div className="mt-2 space-y-2">
              {tracks.map((track) => (
                <label key={track.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={trackIds.includes(track.id)}
                    onChange={() => toggleTrack(track.id)}
                  />
                  {track.name}
                </label>
              ))}
            </div>
          </fieldset>
          {invite.isError ? <ErrorMessage error={invite.error} /> : null}
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? "Creating…" : "Create invite link"}
          </Button>
        </form>
        {inviteUrl ? (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-600">Copy and share this link (no email is sent):</p>
            <CopyLink value={inviteUrl} />
          </div>
        ) : null}
      </Card>

      <Card title="Judges">
        {judges.length === 0 ? (
          <EmptyState title="No judges yet" description="Invite a judge to get started." />
        ) : (
          <Table
            rows={judges}
            rowKey={(row) => row.id}
            columns={[
              {
                key: "name",
                header: "Name",
                render: (row) => (
                  <div>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.email}</div>
                  </div>
                ),
              },
              {
                key: "tracks",
                header: "Tracks",
                render: (row) => (
                  <div className="space-y-1">
                    {tracks.map((track) => (
                      <label key={track.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={row.trackIds.includes(track.id)}
                          onChange={() => {
                            const next = row.trackIds.includes(track.id)
                              ? row.trackIds.filter((id) => id !== track.id)
                              : [...row.trackIds, track.id];
                            void setTracks.mutateAsync({
                              userId: row.id,
                              body: { trackIds: next },
                            });
                          }}
                        />
                        {track.name}
                      </label>
                    ))}
                  </div>
                ),
              },
              {
                key: "progress",
                header: "Progress",
                render: (row) => `${row.submitted} / ${row.assigned}`,
              },
              {
                key: "actions",
                header: "",
                render: (row) => (
                  <Button
                    type="button"
                    variant="danger"
                    disabled={removeJudge.isPending}
                    onClick={() => void removeJudge.mutateAsync(row.id)}
                  >
                    Remove
                  </Button>
                ),
              },
            ]}
          />
        )}
        {setTracks.isError || removeJudge.isError ? (
          <div className="mt-2">
            <ErrorMessage error={setTracks.error ?? removeJudge.error} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
