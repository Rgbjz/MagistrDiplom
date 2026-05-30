import { configureStore } from '@reduxjs/toolkit'
import authReducer from './auth/authSlice'
import userReducer from './user/userSlice'
import coursesReducer from './course/courseSlice'
import courseBuilderReducer from './courseBuilder/courseBuilderSlice'
import testReducer from './tests/testSlice'
import progressReducer from './courseProgress/courseProgressSlice'
import testSessionReducer from './testSession/testSessionSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    courses: coursesReducer,
    courseBuilder: courseBuilderReducer,
    test: testReducer,
    courseProgress: progressReducer,
    testSession: testSessionReducer
  }
})
