import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreativeValidationPanel } from '../components/CreativeValidationPanel.js';

describe('CreativeValidationPanel', () => {
  it('renders the actual validation response when no score breakdown is returned', () => {
    render(
      <CreativeValidationPanel
        isValidating={false}
        onRunValidation={vi.fn()}
        validationResult={{
          isPassed: false,
          blockingCount: 1,
          warningCount: 0,
          infoCount: 0,
          aestheticScore: 6.7,
          findings: [{ code: 'TEST_GATE', severity: 'BLOCKING', message: 'Needs review' }],
        }}
      />,
    );
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.getByText('6.7 / 10.0')).toBeInTheDocument();
  });
});
