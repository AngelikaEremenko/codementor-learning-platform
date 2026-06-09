from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('email', 'username', 'registered_at', 'is_staff')
    ordering = ('-registered_at',)
    fieldsets = UserAdmin.fieldsets + (
        ('Дополнительно', {'fields': ('registered_at',)}),
    )
    readonly_fields = ('registered_at',)
