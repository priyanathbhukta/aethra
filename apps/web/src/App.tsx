// ==============================================================================
// AETHRA Web — Main Desktop Application Root
// ==============================================================================

import React, { useState } from 'react';
import { TenantProvider } from './context/TenantContext.js';
import { AuthProvider } from './context/AuthContext.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { VendorDashboardView } from './components/views/VendorDashboardView.js';
import { SolarEstimatorView } from './components/views/SolarEstimatorView.js';
import { QuotationAcceptanceView } from './components/views/QuotationAcceptanceView.js';
import { ProjectTrackerView } from './components/views/ProjectTrackerView.js';
import { InventoryStockView } from './components/views/InventoryStockView.js';
import { AmcServicePortalView } from './components/views/AmcServicePortalView.js';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  return (
    <AuthProvider>
      <TenantProvider>
        <AppLayout currentTab={currentTab} onTabChange={setCurrentTab}>
          {currentTab === 'dashboard' && <VendorDashboardView onNavigate={setCurrentTab} />}
          {currentTab === 'estimator' && <SolarEstimatorView onCreateQuote={() => setCurrentTab('quotations')} />}
          {currentTab === 'quotations' && (
            <QuotationAcceptanceView onAcceptSuccess={() => setCurrentTab('projects')} />
          )}
          {currentTab === 'projects' && <ProjectTrackerView />}
          {currentTab === 'inventory' && <InventoryStockView />}
          {currentTab === 'service' && <AmcServicePortalView />}
        </AppLayout>
      </TenantProvider>
    </AuthProvider>
  );
};

export default App;
