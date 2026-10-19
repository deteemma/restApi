import type { Routes } from '@angular/router';
import { HomePage } from './home/home-page';

// Pages chargées à la demande : le paquet initial ne contient que la coquille et l'accueil.
export const routes: Routes = [
  { path: '', component: HomePage },
  {
    path: 'collections/:collectionId',
    loadComponent: () => import('./collections/collection-layout').then((m) => m.CollectionLayout),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./collections/collection-settings-page').then((m) => m.CollectionSettingsPage),
      },
      {
        path: 'requests/:requestId',
        loadComponent: () => import('./requests/request-page').then((m) => m.RequestPage),
      },
      {
        path: 'scenarios/:scenarioId',
        loadComponent: () => import('./scenarios/scenario-page').then((m) => m.ScenarioPage),
      },
      {
        path: 'runs',
        loadComponent: () => import('./runs/run-history-page').then((m) => m.RunHistoryPage),
      },
      {
        path: 'scenarios/:scenarioId/runs',
        loadComponent: () => import('./runs/run-history-page').then((m) => m.RunHistoryPage),
      },
      {
        path: 'runs/:runId',
        loadComponent: () => import('./runs/run-detail-page').then((m) => m.RunDetailPage),
      },
      {
        path: 'environments/:environmentId',
        loadComponent: () =>
          import('./environments/environment-page').then((m) => m.EnvironmentPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
