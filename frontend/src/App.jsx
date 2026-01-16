import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import AppRouter from './router/AppRouter'
import { fetchMe } from './store/user/userThunks'
import { initAuth } from './store/auth/authThunks'

function App () {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(initAuth())
      .unwrap()
      .then(() => {
        dispatch(fetchMe())
      })
  }, [dispatch])

  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  )
}

export default App
