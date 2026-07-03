import React from 'react';
import { useEntity } from '@backstage/plugin-catalog-react';

export function MeteringCardContent() {
  const { entity } = useEntity();

  return (
    <div style={{ padding: 16, fontSize: 13, color: '#555' }}>
      Metering plugin loaded for <strong>{entity.metadata.name}</strong>. Cost
      data will appear here once configured.
    </div>
  );
}
