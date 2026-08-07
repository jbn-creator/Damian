import { SiteNav } from '@/components/site/SiteNav';
import { Workspace } from '@/components/workspace/Workspace';

export const metadata = {
  title: 'Try Damian / Visual Product Intelligence Agent',
};

export default function TryPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-void">
      <SiteNav />
      <main className="flex min-h-0 flex-1 flex-col">
        <Workspace />
      </main>
    </div>
  );
}
