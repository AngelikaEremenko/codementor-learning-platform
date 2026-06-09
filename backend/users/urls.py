from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from .admin_metrics import admin_metrics

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', views.MeView.as_view(), name='me'),
    path('profile/', views.update_profile, name='update-profile'),
    path('profile/avatar/', views.update_avatar, name='update-avatar'),
    path('profile/stats/', views.profile_stats, name='profile-stats'),
    path('profile/tag-stats/', views.tag_stats, name='profile-tag-stats'),
    path('change-password/', views.change_password, name='change-password'),
    path('admin/metrics/', admin_metrics, name='admin-metrics'),
]
