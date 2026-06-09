from django.urls import path
from . import views

urlpatterns = [
    path('tasks/<int:task_pk>/hint/', views.get_hint, name='hint'),
]
