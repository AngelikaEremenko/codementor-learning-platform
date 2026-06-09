"""Кастомные валидаторы пароля."""
import re
from django.core.exceptions import ValidationError


class PasswordStrengthValidator:
    """Требует:
    - длина >= 8
    - хотя бы одну строчную букву
    - хотя бы одну заглавную букву
    - хотя бы одну цифру
    - хотя бы один спецсимвол (!@#$%^&*()_+-=[]{};:'",.<>?/\\|`~)
    """

    SPECIAL_CHARS = r"!@#$%^&*()_+\-=\[\]{};:'\",.<>?/\\|`~"
    MIN_LENGTH = 8

    def validate(self, password, user=None):
        errors = []
        if len(password) < self.MIN_LENGTH:
            errors.append(f'Длина пароля должна быть не меньше {self.MIN_LENGTH} символов.')
        if not re.search(r'[a-z]', password):
            errors.append('Пароль должен содержать строчную латинскую букву.')
        if not re.search(r'[A-Z]', password):
            errors.append('Пароль должен содержать заглавную латинскую букву.')
        if not re.search(r'\d', password):
            errors.append('Пароль должен содержать цифру.')
        if not re.search(r'[' + self.SPECIAL_CHARS + r']', password):
            errors.append('Пароль должен содержать специальный символ (!@#$%^&* и т.д.).')
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return (
            f'Пароль должен быть не короче {self.MIN_LENGTH} символов и содержать '
            'строчную и заглавную латинские буквы, цифру и специальный символ.'
        )
