import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ApiError, meQueryKey } from './api'
import { RequireAuth } from './components/RequireAuth'
import './index.css'
import { AttemptPage } from './routes/kid/AttemptPage'
import { KidHomePage } from './routes/KidHomePage'
import { LoginPage } from './routes/LoginPage'
import { AssignmentsPage } from './routes/parent/AssignmentsPage'
import { ChildrenPage } from './routes/parent/ChildrenPage'
import { NewWorksheetPage } from './routes/parent/NewWorksheetPage'
import { ParentLayout } from './routes/parent/ParentLayout'
import { ParentAttemptPage, ResultsPage } from './routes/parent/ResultsPage'
import { SettingsPage } from './routes/parent/SettingsPage'
import { WorksheetDetailPage } from './routes/parent/WorksheetDetailPage'
import { WorksheetsPage } from './routes/parent/WorksheetsPage'
import { ProfilesPage } from './routes/ProfilesPage'

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
      { path: '/kid', element: <KidHomePage /> },
      { path: '/kid/attempt/:id', element: <AttemptPage /> },
      {
        path: '/parent',
        element: <ParentLayout />,
        children: [
          { index: true, element: <Navigate to="/parent/worksheets" replace /> },
          { path: 'worksheets', element: <WorksheetsPage /> },
          { path: 'worksheets/new', element: <NewWorksheetPage /> },
          { path: 'worksheets/:id', element: <WorksheetDetailPage /> },
          { path: 'assignments', element: <AssignmentsPage /> },
          { path: 'results', element: <ResultsPage /> },
          { path: 'attempts/:id', element: <ParentAttemptPage /> },
          { path: 'children', element: <ChildrenPage /> },
          { path: 'settings', element: <SettingsPage /> },
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
    </QueryClientProvider>
  </StrictMode>,
)
