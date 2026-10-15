<?php
declare(strict_types=1);

namespace UnifiedInbox;

/** Private, atomic metadata cache. Keys never contain addresses or tokens. */
final class Cache
{
    private string $directory;

    public function __construct(string $root, string $owner)
    {
        $this->directory = $root . '/' . hash('sha256', $owner);
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new \RuntimeException('Cache unavailable');
        }
        chmod($root, 0700);
        chmod($this->directory, 0700);
        // Bounded, opportunistic cleanup, including removed accounts/configurations.
        foreach (array_slice(glob($this->directory . '/*.json') ?: [], 0, 100) as $file) {
            if (filemtime($file) < time() - 3600) unlink($file);
        }
    }

    private function path(string $key): string
    {
        return $this->directory . '/' . hash('sha256', $key) . '.json';
    }

    public function get(string $key, int $ttl): ?array
    {
        $path = $this->path($key);
        if (!is_file($path)) return null;
        $data = json_decode((string)file_get_contents($path), true);
        if (!is_array($data) || !isset($data['updated']) || time() - $data['updated'] >= $ttl) {
            @unlink($path);
            return null;
        }
        return $data;
    }

    public function put(string $key, array $data): void
    {
        $temp = tempnam($this->directory, '.write-');
        if ($temp === false) throw new \RuntimeException('Cache unavailable');
        try {
            chmod($temp, 0600);
            if (file_put_contents($temp, json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX) === false
                || !rename($temp, $this->path($key))) {
                throw new \RuntimeException('Cache unavailable');
            }
        } finally {
            if (is_file($temp)) unlink($temp);
        }
    }

    public function delete(string $key): void
    {
        $path = $this->path($key);
        if (is_file($path)) unlink($path);
    }

    public static function newest(array $items): array
    {
        usort($items, static fn(array $a, array $b): int =>
            ($b['date'] <=> $a['date']) ?: ($b['uid'] <=> $a['uid']));
        return $items;
    }
}
