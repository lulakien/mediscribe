# shadcn/ui Setup Complete

## Created Files

### Configuration
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/components/components.json` - shadcn/ui config
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/tailwind.config.js` - Updated with design tokens
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/index.css` - CSS variables and animations

### Utilities
- `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/lib/utils.ts` - cn() utility for merging classes

### UI Components (styled per DESIGN.md §7)
All components in `/home/eren/Desktop/code-projects/mediscribe/desktop/frontend/src/components/ui/`:

1. **button.tsx** - Primary, secondary, ghost, danger variants; 10px radius
2. **card.tsx** - Default, interactive, selected, soft variants; 14px radius
3. **badge.tsx** - Status badges with semantic colors (completed, running, failed, etc.)
4. **progress.tsx** - Progress bars with indeterminate animation; includes MiniProgress
5. **table.tsx** - Styled tables with header, body, rows; virtualization-ready
6. **dialog.tsx** - Modal dialogs with 14px radius
7. **select.tsx** - Dropdown select with 10px radius
8. **input.tsx** - Text inputs with 10px radius
9. **switch.tsx** - Toggle switches with primary color
10. **tabs.tsx** - Tab navigation component
11. **toast.tsx** - Toast notification primitives
12. **toaster.tsx** - Toast container component
13. **sonner.tsx** - Sonner-style toast integration with variants
14. **use-toast.ts** - Toast hook for programmatic control
15. **index.ts** - Barrel export for all components

## Installation Required

Run this in the frontend directory:

```bash
cd /home/eren/Desktop/code-projects/mediscribe/desktop/frontend
npm install
```

New dependencies added:
- @radix-ui/react-dialog
- @radix-ui/react-select
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toast
- @radix-ui/react-slot
- class-variance-authority
- clsx
- tailwind-merge
- lucide-react

## Design Token Implementation

All colors from DESIGN.md §3.2 implemented as CSS variables:
- Neutrals: --bg, --surface, --surface-2, --border, --border-strong
- Text: --text, --text-muted, --text-faint
- Brand: --primary, --primary-hover, --primary-soft, --wood, --olive
- Semantic: --success, --warning, --error, --info (with -soft variants)

Border radius per §3.5:
- Cards/dialogs: 14px
- Buttons/inputs: 10px
- Badges/pills: 999px (full)

## Usage Examples

### Button
```tsx
import { Button } from "@/components/ui"

<Button variant="primary">Start Transcribing</Button>
<Button variant="secondary">Cancel</Button>
<Button variant="ghost">Settings</Button>
<Button variant="danger">Delete</Button>
```

### Card
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui"

<Card variant="interactive">
  <CardHeader>
    <CardTitle>Model Name</CardTitle>
  </CardHeader>
  <CardContent>Card content here</CardContent>
</Card>
```

### Badge
```tsx
import { Badge } from "@/components/ui"

<Badge variant="completed">Completed</Badge>
<Badge variant="running" pulse>Running</Badge>
<Badge variant="failed">Failed</Badge>
```

### Progress
```tsx
import { Progress, MiniProgress } from "@/components/ui"

<Progress value={65} max={100} label="Processing" showPercent />
<Progress indeterminate label="Loading model..." />
<MiniProgress value={45} max={100} />
```

### Table
```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui"

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>File</TableHead>
      <TableHead numeric>Duration</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow selected>
      <TableCell>lecture.mp3</TableCell>
      <TableCell numeric>1:23:45</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Dialog
```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui"

<Dialog>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
    </DialogHeader>
    <p>Dialog content here</p>
  </DialogContent>
</Dialog>
```

### Toast (Sonner-style)
```tsx
import { toast } from "@/components/ui"

// In your component
toast.success("Transcription completed")
toast.error("Failed to load model")
toast.warning("Low disk space", { 
  description: "Please free up space",
  action: { label: "View", onClick: () => {} }
})

// Add <SonnerToast /> to your root component
import { SonnerToast } from "@/components/ui"

function App() {
  return (
    <>
      {/* Your app */}
      <SonnerToast />
    </>
  )
}
```

### Select
```tsx
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui"

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Choose model" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="large-v3">large-v3</SelectItem>
    <SelectItem value="medium">medium</SelectItem>
  </SelectContent>
</Select>
```

### Input
```tsx
import { Input } from "@/components/ui"

<Input type="text" placeholder="Search files..." />
```

### Switch
```tsx
import { Switch } from "@/components/ui"

<Switch checked={enabled} onCheckedChange={setEnabled} />
```

### Tabs
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui"

<Tabs defaultValue="text">
  <TabsList>
    <TabsTrigger value="text">Text</TabsTrigger>
    <TabsTrigger value="timestamped">Timestamped</TabsTrigger>
  </TabsList>
  <TabsContent value="text">Text content</TabsContent>
  <TabsContent value="timestamped">Timestamped content</TabsContent>
</Tabs>
```

## TypeScript Path Alias

Ensure `tsconfig.json` has the path alias configured:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Dark Theme Support

All components support dark theme via the `.dark` class. Toggle by adding/removing the class on the root element:

```tsx
document.documentElement.classList.toggle('dark')
```

Dark theme colors are pre-configured per DESIGN.md §3.2 "Study Night" theme.

## Animation Support

Progress bars include indeterminate animation. All components respect `prefers-reduced-motion` via CSS.

Custom keyframes added:
- `progress-indeterminate` - Sweeping progress bar animation (1.4s ease-in-out)

## Component Features Aligned with DESIGN.md

- **10px radius** for buttons, inputs, selects (§3.5)
- **14px radius** for cards, dialogs (§3.5)
- **999px radius** for badges/pills (§3.5)
- **Warm color palette** with terracotta primary (#B65A2A) (§3.2)
- **Semantic state colors** - muted, never neon (§3.2)
- **Typography tokens** ready for Fraunces/Albert Sans/IBM Plex Mono (§3.3)
- **Focus rings** - 2px primary at 40% opacity with 2px offset (§7)
- **Status badges** - all variants from §6: completed, running, failed, etc.
- **Running badge** with pulsing dot (§7)
- **Soft card shadow** - warm shadows, no harsh blacks (§3.6)
- **Interactive card hover** - border-strong + shadow + -1px translateY (§3.6)
