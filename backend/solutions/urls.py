from django.urls import path
from . import views

urlpatterns = [
    path('tasks/<int:task_pk>/submit/', views.submit_solution, name='submit'),
    path('submissions/', views.my_submissions, name='submissions'),
    path('run-code/', views.run_code_inline, name='run-code'),
]
