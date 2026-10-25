import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ApiError, meQueryKey } from './api'
import { RequireAuth } from './components/RequireAuth'
import './index.css'
import { KidHomePage } from './routes/KidHomePage'
import { LoginPage } from './routes/LoginPage'
import { ChildrenPage } from './routes/parent/ChildrenPage'
import { ParentLayout } from './routes/parent/ParentLayout'
import { ProfilesPage } from './routes/ProfilesPage'

// Phiên hết hạn hoặc khu phụ huynh bị khoá giữa chừng → tải lại /auth/me để các guard xử lý.
const onApiError = (err: unknown) => {
  if (err instanceof ApiError && (err.status === 401 || err.body.error === 'parent_locked')) {
    queryClient.invalidateQueries({ queryKey: meQueryKey })
  }
}
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
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
      {
        path: '/parent',
        element: <ParentLayout />,
        children: [
          { index: true, element: <Navigate to="/parent/children" replace /> },
          { path: 'children', element: <ChildrenPage /> },
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
