from django.urls import path
from . import views

urlpatterns = [
    path('modules/', views.module_list, name='module-list'),
    path('modules/<int:pk>/', views.module_detail, name='module-detail'),
    path('modules/<int:module_pk>/next-task/', views.next_task, name='next-task'),
    path('theories/<int:theory_pk>/check-quiz/', views.check_quiz, name='check-quiz'),
    path('mini-tasks/<int:mini_pk>/check/', views.check_mini_task, name='check-mini-task'),
    path('progress/', views.user_progress_list, name='progress-list'),
]
