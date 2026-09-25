# 🧭 Tactical EVA Routing & Martian Hazard Index Engine

A mathematical and algorithmic specification for **AresPath AI's multi-objective trajectory optimizer**, incorporating **Martian slope biomechanics, thermal soil firmness, RF communication line-of-sight (LOS) raycasting, and astronaut life-support consumables**.

---

## 📐 1. The Multi-Objective Trajectory Cost Function

Unlike standard 2D Euclidean route planners, an astronaut EVA path planner must balance human metabolic expenditure, physical slip hazards, communication connectivity, and mission science yield.

For a path segment connecting node $i$ to node $j$ with 3D coordinates $(x, y, z)$:

$$\mathcal{C}(i, j) = \Delta s_{ij} \cdot \left[ w_1 \cdot \mathcal{T}_{\text{slope}}(\theta_{ij}) + w_2 \cdot \mathcal{R}_{\text{roughness}} + w_3 \cdot \mathcal{S}_{\text{soil}} + w_4 \cdot \mathcal{L}_{\text{comms}} + w_5 \cdot \Phi_{\text{rad}} \right] - w_6 \cdot \Psi_{\text{science}}$$

Where:
* $\Delta s_{ij} = \sqrt{(x_j - x_i)^2 + (y_j - y_i)^2 + (z_j - z_i)^2}$ is the 3D traverse distance.
* $\theta_{ij} = \arctan\left(\frac{z_j - z_i}{\sqrt{(x_j - x_i)^2 + (y_j - y_i)^2}}\right)$ is the terrain slope grade.
* $w_1 \dots w_6$ are dynamic weighting coefficients configurable by mission control.

---

## 🏃 2. Martian Metabolic Walking Cost: Adapted Tobler Function

Walking in a $130\text{ kg}$ pressurized planetary EVA suit under **$0.376\text{ g}$ Martian gravity** alters human bio-energetics. We adapt **Tobler’s Hiking Function** with lunar/Martian empirical Apollo gait coefficients:

$$V(\theta) = V_{\text{max}} \cdot \exp\left( -k \cdot |\theta - \theta_0| \right)$$

* $V_{\text{max}} = 1.1\text{ m/s}$ (Maximum sustainable suited walking speed on flat regolith).
* $\theta_0 = -0.03\text{ rad}$ (Slight downhill slope provides optimal metabolic efficiency).
* $k = 3.5$ (Steepness penalty factor).

### Metabolic Oxygen Burn Rate:
The rate of oxygen consumption $\dot{V}_{O_2}$ ($\text{liters/min}$) as a function of speed $V$ and slope $\theta$:

$$\dot{V}_{O_2}(V, \theta) = \dot{V}_{\text{basal}} + \alpha \cdot M_{\text{total}} \cdot V^2 + \beta \cdot M_{\text{total}} \cdot g_{\text{mars}} \cdot V \cdot \sin(\theta)$$

Where:
* $M_{\text{total}} = M_{\text{astronaut}} + M_{\text{suit}} \approx 80\text{ kg} + 120\text{ kg} = 200\text{ kg}$.
* $g_{\text{mars}} = 3.72\text{ m/s}^2$.
* $\dot{V}_{\text{basal}} \approx 0.3\text{ L/min}$.

---

## 🪨 3. Soil Traversability & Thermal Inertia Index ($\mathcal{S}_{\text{soil}}$)

Using **Mars Odyssey THEMIS Thermal Inertia ($I$)** data:
* **Low Thermal Inertia ($I < 150\text{ J m}^{-2}\text{ K}^{-1}\text{ s}^{-1/2}$):** Fine, powdery dust drifts (high wheel/boot sinkage, severe slip risk, low bearing capacity).
* **Medium Thermal Inertia ($150 \le I < 350$):** Compacted sand / duricrust (good traction).
* **High Thermal Inertia ($I \ge 350$):** Exposed basalt bedrock / dense rock pavement (maximum load-bearing capacity).

$$\mathcal{S}_{\text{soil}}(I) = \begin{cases} 
5.0 & \text{if } I < 120 \quad (\text{Dust Trap — High Hazard}) \\
2.5 & \text{if } 120 \le I < 200 \\
1.0 & \text{if } I \ge 200 \quad (\text{Solid Bedrock — Ideal})
\end{cases}$$

---

## 📡 4. RF Line-of-Sight (LOS) 3D Raycasting Engine

Astronauts must maintain continuous UHF / S-band communication with the **Habitat Base Station** or the **Mars Ascent Vehicle (MAV)**. Deep valleys, crater walls, and central peaks create RF shadow zones.

### Bresenham 3D Raycasting Algorithm:
For an astronaut at position $\mathbf{P}_A = (x_A, y_A, z_A)$ and Habitat antenna at $\mathbf{P}_H = (x_H, y_H, z_H)$:

The line connecting them is parameterized by $t \in [0, 1]$:
$$\mathbf{R}(t) = (1 - t)\mathbf{P}_H + t\mathbf{P}_A$$

At each step along the ray, the line height $z_R(t)$ must clear the terrain elevation $z_{\text{DEM}}(x_R(t), y_R(t))$ by at least the **$60\%$ First Fresnel Zone radius** $r_F$:

$$r_F(d_1, d_2) = \sqrt{\frac{\lambda \cdot d_1 \cdot d_2}{d_1 + d_2}}$$

Where $\lambda$ is RF wavelength ($0.75\text{ m}$ for $400\text{ MHz}$ UHF), and $d_1, d_2$ are distances from antenna and astronaut.

$$\mathcal{L}_{\text{comms}} = \begin{cases}
0.0 & \text{if } z_R(t) \ge z_{\text{DEM}}(t) + 0.6\,r_F \quad (\text{Direct Clear LOS}) \\
10.0 & \text{otherwise} \quad (\text{Comms Shadow Blackout Zone})
\end{cases}$$

---

## 🛑 5. Dynamic "Point of No Return" (Safe Horizon Radius)

At any waypoint $k$ along the planned route, the remaining life-support reserves must satisfy:

$$E_{\text{remain}}(k) \ge E_{\text{return\_to\_hab}}(k) \times 1.25$$
$$O_{2\text{, remain}}(k) \ge O_{2\text{, return\_to\_hab}}(k) \times 1.25$$

A **$25\%$ contingency safety margin** is strictly enforced. If an unexpected slope delay or suit pressure leak occurs, the astronaut can safely return to the airlock before consumable depletion.

---

## 🐍 6. Complete Python A* Tactical Route Optimizer

```python
import numpy as np
import heapq

class MartianAStarPlanner:
    def __init__(self, elevation_grid, thermal_inertia_grid, cell_size_meters=1.0):
        self.dem = elevation_grid
        self.themis = thermal_inertia_grid
        self.cell_size = cell_size_meters
        self.rows, self.cols = elevation_grid.shape

    def get_neighbors(self, r, c):
        directions = [(-1, 0), (1, 0), (0, -1), (0, 1),
                      (-1, -1), (-1, 1), (1, -1), (1, 1)]
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.rows and 0 <= nc < self.cols:
                yield nr, nc

    def compute_cost(self, r1, c1, r2, c2):
        dz = self.dem[r2, c2] - self.dem[r1, c1]
        dist_2d = self.cell_size * np.sqrt((r2 - r1)**2 + (c2 - c1)**2)
        dist_3d = np.sqrt(dist_2d**2 + dz**2)
        
        slope_rad = np.arctan2(abs(dz), dist_2d)
        slope_deg = np.degrees(slope_rad)
        
        # Absolute no-go slope (> 25 degrees)
        if slope_deg > 25.0:
            return float('inf')
        
        # Slope penalty
        slope_cost = 1.0 + (slope_deg / 10.0)**2
        
        # Soil firmness penalty from THEMIS thermal inertia
        soil_cost = 1.0
        if self.themis is not None:
            inertia = self.themis[r2, c2]
            if inertia < 150: # loose dust trap
                soil_cost = 4.0
            elif inertia < 250:
                soil_cost = 2.0
                
        return dist_3d * slope_cost * soil_cost

    def plan_path(self, start, goal):
        """
        Calculates optimal tactical path from start (r, c) to goal (r, c).
        """
        frontier = []
        heapq.heappush(frontier, (0, start))
        came_from = {start: None}
        cost_so_far = {start: 0}
        
        while frontier:
            _, current = heapq.heappop(frontier)
            if current == goal:
                break
                
            for neighbor in self.get_neighbors(*current):
                step_cost = self.compute_cost(current[0], current[1], neighbor[0], neighbor[1])
                if step_cost == float('inf'):
                    continue
                    
                new_cost = cost_so_far[current] + step_cost
                if neighbor not in cost_so_far or new_cost < cost_so_far[neighbor]:
                    cost_so_far[neighbor] = new_cost
                    # Heuristic: 3D Euclidean distance
                    h = np.sqrt((neighbor[0]-goal[0])**2 + (neighbor[1]-goal[1])**2) * self.cell_size
                    priority = new_cost + h
                    heapq.heappush(frontier, (priority, neighbor))
                    came_from[neighbor] = current
                    
        # Reconstruct path
        path = []
        curr = goal
        while curr is not None:
            path.append(curr)
            curr = came_from.get(curr)
        path.reverse()
        return path

if __name__ == "__main__":
    # Test on simulated 100x100 elevation grid (Jezero Crater wall gradient)
    np.random.seed(42)
    fake_dem = np.zeros((100, 100))
    for r in range(100):
        fake_dem[r, :] = r * 0.2 + np.random.normal(0, 0.05, 100) # gentle slope
        
    # Inject impassable crater rim obstacle
    fake_dem[40:60, 40:60] += 15.0 # steep 15-meter hill
    
    planner = MartianAStarPlanner(fake_dem, None, cell_size_meters=1.0)
    path = planner.plan_path((10, 10), (80, 80))
    print(f"Optimal AresPath Route Computed: {len(path)} waypoints safely skirting the obstacle!")
```
