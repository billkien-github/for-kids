import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ApiError, meQueryKey } from './api'
import { RequireAuth } from './components/RequireAuth'
import { UpdateChecker } from './components/UpdateChecker'
import './index.css'
import { AchievementsPage } from './routes/kid/AchievementsPage'
import { AttemptPage } from './routes/kid/AttemptPage'
import { KidLayout } from './routes/kid/KidLayout'
import { KidHomePage } from './routes/KidHomePage'
import { LoginPage } from './routes/LoginPage'
import { ProfilesPage } from './routes/ProfilesPage'

type ParentPages = typeof import('./routes/parent/pages')
const parentPage = (name: keyof ParentPages) => async () => ({ Component: (await import('./routes/parent/pages'))[name] })

// Phiên hết hạn hoặc khu phụ huynh bị khoá giữa chừng → tải lại /auth/me để các guard xử lý.
const onApiError = (err: unknown) => {
  if (err instanceof ApiError && (err.status === 401 || err.body.error === 'parent_locked')) {
    queryClient.invalidateQueries({ queryKey: meQueryKey })
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Bỏ qua lỗi của chính query 'me', nếu không 401 → invalidate 'me' → gọi lại → 401… lặp vô hạn.
    onError: (err, query) => query.queryKey[0] !== meQueryKey[0] && onApiError(err),
  }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: { retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2 },
  },
})

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <ProfilesPage /> },
      {
        // Khung chung có thanh tab cho con; màn làm bài nằm ngoài để con tập trung.
        element: <KidLayout />,
        children: [
          { path: '/kid', element: <KidHomePage /> },
          { path: '/kid/achievements', element: <AchievementsPage /> },
        ],
      },
      { path: '/kid/attempt/:id', element: <AttemptPage /> },
      {
        path: '/parent',
        lazy: parentPage('ParentLayout'),
        children: [
          { index: true, element: <Navigate to="/parent/overview" replace /> },
          { path: 'overview', lazy: parentPage('OverviewPage') },
          { path: 'rewards', lazy: parentPage('RewardsPage') },
          { path: 'worksheets', lazy: parentPage('WorksheetsPage') },
          { path: 'worksheets/new', lazy: parentPage('NewWorksheetPage') },
          { path: 'worksheets/:id', lazy: parentPage('WorksheetDetailPage') },
          { path: 'assignments', lazy: parentPage('AssignmentsPage') },
          { path: 'results', element: <Navigate to="/parent/overview?tab=history" replace /> },
          { path: 'attempts/:id', lazy: parentPage('ParentAttemptPage') },
          { path: 'children', element: <Navigate to="/parent/settings/children" replace /> },
          { path: 'settings/:section?', lazy: parentPage('SettingsPage') },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <UpdateChecker />
    </QueryClientProvider>
  </StrictMode>,
)
