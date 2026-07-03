import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MeteringCardContent } from '../components/MeteringCard/MeteringCard';
import { TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { meteringApiRef, CostResult } from '../api';
import { Entity } from '@backstage/catalog-model';

const mockEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'test-app',
    namespace: 'default',
    annotations: {
      'backstage.io/kubernetes-namespace': 'test-ns',
      'backstage.io/kubernetes-id': 'test-deployment',
    },
  },
  spec: { type: 'service', lifecycle: 'production', owner: 'team-a' },
};

const mockEntityNoAnnotation: Entity = {
  ...mockEntity,
  metadata: { ...mockEntity.metadata, annotations: {} },
};

const mockCostResult: CostResult = {
  entityRef: 'component:default/test-app',
  namespace: 'test-ns',
  deployment: 'test-deployment',
  cpuCores: 0.5,
  memGiB: 1.0,
  cpuCostPerHour: 0.024,
  memoryCostPerHour: 0.006,
  hourlyCost: 0.03,
  cpuRequestCores: 1.0,
  memRequestGiB: 2.0,
  replicaCount: 2,
  windowHours: 24,
  sampledAt: new Date().toISOString(),
};

const mockMeteringApi = {
  getCost: jest.fn().mockResolvedValue(mockCostResult),
  getCostHistory: jest.fn().mockResolvedValue([]),
};

function renderCard(entity: Entity, api = mockMeteringApi) {
  return render(
    <TestApiProvider apis={[[meteringApiRef, api]]}>
      <EntityProvider entity={entity}>
        <MeteringCardContent />
      </EntityProvider>
    </TestApiProvider>,
  );
}

describe('MeteringCardContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows annotation guard message when kubernetes-namespace is absent', () => {
    renderCard(mockEntityNoAnnotation);
    expect(
      screen.getByText(/backstage\.io\/kubernetes-namespace/),
    ).toBeTruthy();
  });

  it('renders cost KPIs after loading', async () => {
    await act(async () => {
      renderCard(mockEntity);
    });

    await waitFor(() => {
      expect(screen.getByText(/Hourly Cost/i)).toBeTruthy();
    });
  });

  it('displays error message when API fails', async () => {
    const failingApi = {
      getCost: jest.fn().mockRejectedValue(new Error('Prometheus unreachable')),
      getCostHistory: jest.fn().mockResolvedValue([]),
    };

    await act(async () => {
      renderCard(mockEntity, failingApi);
    });

    await waitFor(() => {
      expect(screen.getByText(/Prometheus unreachable/i)).toBeTruthy();
    });
  });
});
