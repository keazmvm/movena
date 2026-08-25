import type { M3uEntry } from '../../api/m3u';
import { useXmltvGuide } from '../../api/xmltv';
import { M3uStreamHealthChecker, type M3uHealthStatuses } from './M3uStreamHealthChecker';

interface M3uDiagnosticsWorkspaceProps {
  entries: M3uEntry[];
  healthStatuses: M3uHealthStatuses;
  onUpdateHealthStatuses: (statuses: M3uHealthStatuses) => void;
  onUpdateEntries: (entries: M3uEntry[]) => void;
  parserWarnings: string[];
  sourceId?: string | undefined;
}

export function M3uDiagnosticsWorkspace(props: M3uDiagnosticsWorkspaceProps) {
  const guideQuery = useXmltvGuide();
  return (
    <M3uStreamHealthChecker
      {...props}
      guide={guideQuery.data}
      guideLoading={guideQuery.isLoading}
      guideError={guideQuery.error}
    />
  );
}
