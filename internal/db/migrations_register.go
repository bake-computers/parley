package db

import (
	"fmt"
	"io"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"sync"
	"time"

	parleymigrations "github.com/parley-bot/parley/migrations"
	"github.com/uptrace/bun/migrate"
)

var (
	Migrations     = migrate.NewMigrations()
	migrationsOnce sync.Once
	migrationsErr  error
)

var dieselFolderRE = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})-(\d{6})_(.+)$`)

// EnsureMigrationsRegistered loads embedded SQL migrations into Migrations (idempotent).
func EnsureMigrationsRegistered() error {
	migrationsOnce.Do(func() {
		migrationsErr = registerDieselStyleMigrations()
	})
	return migrationsErr
}

func ensureMigrationsRegistered() error {
	return EnsureMigrationsRegistered()
}

func registerDieselStyleMigrations() error {
	entries, err := fs.ReadDir(parleymigrations.FS, ".")
	if err != nil {
		return fmt.Errorf("read migrations embed: %w", err)
	}

	type folder struct {
		dir string
		bun string
	}
	var folders []folder

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		m := dieselFolderRE.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		bunName := fmt.Sprintf("%s%s%s%s_%s", m[1], m[2], m[3], m[4], m[5])
		folders = append(folders, folder{dir: e.Name(), bun: bunName})
	}

	sort.Slice(folders, func(i, j int) bool {
		return folders[i].dir < folders[j].dir
	})

	files := make(map[string][]byte)
	for _, f := range folders {
		upPath := f.dir + "/up.sql"
		downPath := f.dir + "/down.sql"
		up, err := parleymigrations.FS.ReadFile(upPath)
		if err != nil {
			return fmt.Errorf("read %s: %w", upPath, err)
		}
		down, err := parleymigrations.FS.ReadFile(downPath)
		if err != nil {
			return fmt.Errorf("read %s: %w", downPath, err)
		}
		files[f.bun+".up.sql"] = up
		files[f.bun+".down.sql"] = down
	}

	return Migrations.Discover(&flatFS{files: files})
}

type flatFS struct {
	files map[string][]byte
}

func (f *flatFS) Open(name string) (fs.File, error) {
	name = path.Clean(name)
	if name == "." {
		names := make([]string, 0, len(f.files))
		for k := range f.files {
			names = append(names, k)
		}
		sort.Strings(names)
		return &flatDir{names: names}, nil
	}
	body, ok := f.files[name]
	if !ok {
		return nil, fmt.Errorf("flatFS: file not found: %s", name)
	}
	return &flatFile{name: name, data: body}, nil
}

type flatDir struct {
	names  []string
	offset int
}

func (d *flatDir) Stat() (fs.FileInfo, error) {
	return &mapFileInfo{name: ".", dir: true}, nil
}

func (d *flatDir) Read([]byte) (int, error) {
	return 0, fmt.Errorf("is a directory")
}

func (d *flatDir) Close() error { return nil }

func (d *flatDir) ReadDir(n int) ([]fs.DirEntry, error) {
	if d.offset >= len(d.names) {
		return nil, io.EOF
	}
	if n <= 0 {
		n = len(d.names) - d.offset
	}
	end := d.offset + n
	if end > len(d.names) {
		end = len(d.names)
	}
	out := make([]fs.DirEntry, end-d.offset)
	for i, name := range d.names[d.offset:end] {
		out[i] = &flatEntry{name: name}
	}
	d.offset = end
	return out, nil
}

type flatEntry struct {
	name string
}

func (e *flatEntry) Name() string               { return e.name }
func (e *flatEntry) IsDir() bool                { return false }
func (e *flatEntry) Type() fs.FileMode          { return 0 }
func (e *flatEntry) Info() (fs.FileInfo, error) { return &mapFileInfo{name: e.name}, nil }

type flatFile struct {
	name   string
	data   []byte
	offset int64
}

func (f *flatFile) Stat() (fs.FileInfo, error) {
	return &mapFileInfo{name: f.name, size: int64(len(f.data))}, nil
}

func (f *flatFile) Read(b []byte) (int, error) {
	if f.offset >= int64(len(f.data)) {
		return 0, io.EOF
	}
	n := copy(b, f.data[f.offset:])
	f.offset += int64(n)
	return n, nil
}

func (f *flatFile) Close() error { return nil }

type mapFileInfo struct {
	name string
	size int64
	dir  bool
}

func (i *mapFileInfo) Name() string       { return i.name }
func (i *mapFileInfo) Size() int64        { return i.size }
func (i *mapFileInfo) Mode() fs.FileMode  { return 0 }
func (i *mapFileInfo) ModTime() time.Time { return time.Time{} }
func (i *mapFileInfo) IsDir() bool        { return i.dir }
func (i *mapFileInfo) Sys() any           { return nil }
