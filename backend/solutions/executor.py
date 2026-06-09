"""
Модуль безопасного выполнения C++-кода пользователя.
Компилирует код через g++ и запускает в отдельном процессе с ограничением по времени.
"""
import subprocess
import tempfile
import os
import shutil
from django.conf import settings


def find_gpp():
    """Ищет компилятор g++ в системе."""
    # Сначала ищем в PATH
    gpp = shutil.which('g++')
    if gpp:
        return gpp

    # Типичные пути MinGW на Windows
    candidates = [
        r'C:\mingw64\bin\g++.exe',
        r'C:\msys64\mingw64\bin\g++.exe',
        r'C:\msys64\ucrt64\bin\g++.exe',
        r'C:\Program Files\mingw-w64\bin\g++.exe',
        r'C:\Program Files (x86)\mingw-w64\bin\g++.exe',
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path

    return None


def run_code(code: str, stdin_data: str = '') -> dict:
    """
    Компилирует C++-код и запускает его.
    Returns: {'stdout': str, 'stderr': str, 'timed_out': bool, 'returncode': int}
    """
    timeout = getattr(settings, 'CODE_EXECUTION_TIMEOUT', 10)

    gpp = find_gpp()
    if not gpp:
        return {
            'stdout': '',
            'stderr': 'Компилятор g++ не найден. Установите MinGW-w64.',
            'timed_out': False,
            'returncode': -1,
        }

    # Создаём временную директорию для исходника и бинарника
    tmpdir = tempfile.mkdtemp()
    src_path = os.path.join(tmpdir, 'solution.cpp')
    bin_path = os.path.join(tmpdir, 'solution.exe' if os.name == 'nt' else 'solution')

    try:
        # Записываем исходный код
        with open(src_path, 'w', encoding='utf-8') as f:
            f.write(code)

        # Компилируем
        compile_result = subprocess.run(
            [gpp, src_path, '-o', bin_path, '-std=c++17', '-O2'],
            capture_output=True,
            text=True,
            timeout=30,
            encoding='utf-8',
            errors='replace',
        )

        if compile_result.returncode != 0:
            return {
                'stdout': '',
                'stderr': compile_result.stderr,
                'timed_out': False,
                'returncode': compile_result.returncode,
            }

        # Запускаем скомпилированную программу
        try:
            run_result = subprocess.run(
                [bin_path],
                input=stdin_data,
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding='utf-8',
                errors='replace',
            )
            return {
                'stdout': run_result.stdout,
                'stderr': run_result.stderr,
                'timed_out': False,
                'returncode': run_result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                'stdout': '',
                'stderr': 'Превышено время выполнения.',
                'timed_out': True,
                'returncode': -1,
            }

    except subprocess.TimeoutExpired:
        return {
            'stdout': '',
            'stderr': 'Превышено время компиляции.',
            'timed_out': True,
            'returncode': -1,
        }
    except Exception as e:
        return {
            'stdout': '',
            'stderr': str(e),
            'timed_out': False,
            'returncode': -1,
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def check_submission(code: str, test_cases: list) -> dict:
    """
    Проверяет решение пользователя на наборе тест-кейсов.
    test_cases: [{"input": "...", "expected": "..."}]
    Returns: {'status': 'accepted'|'wrong'|'error'|'timeout', 'results': [...], 'error_message': str}
    """
    if not test_cases:
        result = run_code(code)
        if result['timed_out']:
            return {'status': 'timeout', 'results': [], 'error_message': 'Превышено время выполнения.'}
        if result['returncode'] != 0:
            return {'status': 'error', 'results': [], 'error_message': result['stderr']}
        return {'status': 'accepted', 'results': [], 'error_message': ''}

    results = []
    all_passed = True

    for i, tc in enumerate(test_cases):
        stdin = tc.get('input', '')
        expected = tc.get('expected', '').strip()

        run_result = run_code(code, stdin_data=stdin)

        if run_result['timed_out']:
            results.append({
                'test': i + 1,
                'passed': False,
                'input': stdin,
                'expected': expected,
                'got': '',
                'error': 'Превышено время выполнения.',
            })
            all_passed = False
            continue

        if run_result['returncode'] != 0:
            results.append({
                'test': i + 1,
                'passed': False,
                'input': stdin,
                'expected': expected,
                'got': '',
                'error': run_result['stderr'],
            })
            all_passed = False
            continue

        got = run_result['stdout'].strip()
        passed = got == expected

        if not passed:
            all_passed = False

        results.append({
            'test': i + 1,
            'passed': passed,
            'input': stdin,
            'expected': expected,
            'got': got,
            'error': '',
        })

    if all_passed:
        status = 'accepted'
        error_message = ''
    else:
        errors = [r for r in results if r.get('error')]
        if errors:
            first_error = errors[0]['error']
            if 'Превышено время' in first_error:
                status = 'timeout'
            else:
                status = 'error'
            error_message = first_error
        else:
            status = 'wrong'
            error_message = ''

    return {
        'status': status,
        'results': results,
        'error_message': error_message,
    }
